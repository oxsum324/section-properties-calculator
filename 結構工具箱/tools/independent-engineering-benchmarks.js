const fs = require('fs');
const path = require('path');

const toolsRoot = __dirname;
const repoRoot = path.resolve(toolsRoot, '..', '..');
const defaultCatalogPath = path.join(toolsRoot, 'independent-engineering-benchmarks.catalog.json');
const defaultOutputPath = path.join(repoRoot, 'output', 'audit', 'independent-engineering-benchmarks.json');

const ROOT_KEYS = ['schemaVersion', 'kind', 'portfolio', 'benchmarks', 'priorityTargets'];
const PORTFOLIO_KEYS = ['eligibleState', 'eligibleFormalRoutes', 'scopeNote'];
const BENCHMARK_KEYS = ['id', 'route', 'title', 'productionModule', 'oracle', 'referenceType', 'referenceBasis', 'input', 'assertions'];
const ASSERTION_KEYS = ['path', 'absTolerance'];
const TARGET_KEYS = ['route', 'priority', 'evidenceNeeded'];

function exactKeys(value, expected, label, issues) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${label}:object-required`);
    return;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join('\u0000') !== wanted.join('\u0000')) {
    issues.push(`${label}:keys:${actual.join(',')}`);
  }
}

function getPath(value, dottedPath) {
  return String(dottedPath).split('.').reduce((current, key) => (
    current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
  ), value);
}

function equipmentOracle(i) {
  const serviceWeight = i.equipmentWeight + i.fluidWeight + i.accessoryWeight;
  const designWeight = serviceWeight * i.dynamicFactor;
  const pointLoad = designWeight / i.supportCount;
  const spreadB = i.contactB + 2 * i.spreadDepth;
  const spreadL = i.contactL + 2 * i.spreadDepth;
  return {
    serviceWeight,
    designWeight,
    pointLoad,
    qContact: pointLoad / (i.contactB * i.contactL),
    spreadB,
    spreadL,
    qSpread: pointLoad / (spreadB * spreadL),
    qEquivalent: designWeight / (i.planB * i.planL),
    horizontalTotal: designWeight * i.horizontalCoeff,
    horizontalPerSupport: designWeight * i.horizontalCoeff / i.supportCount
  };
}

function earthOracle(i) {
  const sinPhi = Math.sin(i.phiDeg * Math.PI / 180);
  const Ka = (1 - sinPhi) / (1 + sinPhi);
  const soilForce = 0.5 * Ka * i.gammaSoil * i.H * i.H;
  const surchargeForce = Ka * i.surcharge * i.H;
  const totalForce = soilForce + surchargeForce;
  const overturningMoment = soilForce * i.H / 3 + surchargeForce * i.H / 2;
  return {
    Ka,
    soilForce,
    surchargeForce,
    totalForce,
    overturningMoment,
    fsSlide: (i.mu * i.verticalLoad) / totalForce,
    fsOver: (i.verticalLoad * i.baseB / 2) / overturningMoment
  };
}

function foundationOracle(i) {
  const area = i.B * i.L;
  const Ptotal = i.P;
  const qAvg = Ptotal / area;
  const qFromMx = 6 * i.Mx / (i.B * i.L * i.L);
  const qFromMy = 6 * i.My / (i.L * i.B * i.B);
  return {
    area,
    Ptotal,
    qAvg,
    qFromMx,
    qFromMy,
    qmax: qAvg + Math.abs(qFromMx) + Math.abs(qFromMy),
    qmin: qAvg - Math.abs(qFromMx) - Math.abs(qFromMy),
    fsSlide: Math.hypot(i.Hx, i.Hy) > 0 ? (i.mu * Ptotal + i.passive) / Math.hypot(i.Hx, i.Hy) : Infinity,
    fsOver: Math.min(
      Math.abs(i.My) > 0 ? Ptotal * (i.B / 2) / Math.abs(i.My) : Infinity,
      Math.abs(i.Mx) > 0 ? Ptotal * (i.L / 2) / Math.abs(i.Mx) : Infinity
    )
  };
}

function rcColumnPmOracle(i) {
  const a = Math.min(i.beta1 * i.c, i.h);
  const concreteForce = 0.85 * i.fc * i.b * a;
  let PnKgf = concreteForce;
  let MnKgfCm = concreteForce * (i.h / 2 - a / 2);
  let dt = 0;
  for (const bar of i.bars) {
    dt = Math.max(dt, bar.y);
    const strain = 0.003 * (i.c - bar.y) / i.c;
    const stress = Math.max(-i.fy, Math.min(i.fy, strain * i.Es));
    const netForce = bar.y < a ? (stress - 0.85 * i.fc) * bar.As : stress * bar.As;
    PnKgf += netForce;
    MnKgfCm += netForce * (i.h / 2 - bar.y);
  }
  const epsT = 0.003 * (dt - i.c) / i.c;
  const phi = epsT >= 0.005
    ? i.phiTen
    : (epsT <= 0.002
      ? i.phiComp
      : i.phiComp + (i.phiTen - i.phiComp) * (epsT - 0.002) / 0.003);
  const Ast = i.bars.reduce((sum, bar) => sum + bar.As, 0);
  const Po = (0.85 * i.fc * (i.b * i.h - Ast) + i.fy * Ast) / 1000;
  const phiPnMax = i.phiComp * i.PnMaxFactor * Po;
  const Pn = PnKgf / 1000;
  const Mn = Math.abs(MnKgfCm) / 1e5;
  const phiPn = phi * Pn;
  const phiMn = phi * Mn;
  return {
    Pn,
    Mn,
    epsT,
    phi,
    phiPn,
    phiMn,
    Po,
    phiPnMax,
    designP: Pn > 0 ? Math.min(phiPn, phiPnMax) : phiPn,
    designM: phiMn
  };
}

const ORACLES = {
  'equipment-basic-load-path': equipmentOracle,
  'earth-rankine-dry-active': earthOracle,
  'foundation-external-load-only': foundationOracle,
  'rc-column-balanced-nearby-pm-point': rcColumnPmOracle
};

function loadProductionModule(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`unsafe-production-module:${relativePath}`);
  }
  const absolutePath = path.resolve(toolsRoot, normalized);
  if (!absolutePath.startsWith(`${toolsRoot}${path.sep}`) || !fs.existsSync(absolutePath)) {
    throw new Error(`missing-production-module:${relativePath}`);
  }
  return require(absolutePath);
}

function validateCatalog(catalog) {
  const issues = [];
  exactKeys(catalog, ROOT_KEYS, 'catalog', issues);
  if (catalog?.schemaVersion !== 1) issues.push('catalog:schema-version');
  if (catalog?.kind !== 'independent-engineering-benchmarks.v1') issues.push('catalog:kind');
  exactKeys(catalog?.portfolio, PORTFOLIO_KEYS, 'portfolio', issues);
  if (catalog?.portfolio?.eligibleState !== 'formal') issues.push('portfolio:eligible-state');
  if (!Number.isInteger(catalog?.portfolio?.eligibleFormalRoutes) || catalog.portfolio.eligibleFormalRoutes < 1) issues.push('portfolio:eligible-formal-routes');
  if (!String(catalog?.portfolio?.scopeNote || '').includes('golden case')) issues.push('portfolio:scope-note-distinction');
  if (!Array.isArray(catalog?.benchmarks) || catalog.benchmarks.length < 1) issues.push('benchmarks:required');
  if (!Array.isArray(catalog?.priorityTargets)) issues.push('priority-targets:array-required');

  const ids = new Set();
  const routes = new Set();
  for (const [index, benchmark] of (catalog?.benchmarks || []).entries()) {
    const label = `benchmark[${index}]`;
    exactKeys(benchmark, BENCHMARK_KEYS, label, issues);
    if (!benchmark.id || ids.has(benchmark.id)) issues.push(`${label}:unique-id`);
    ids.add(benchmark.id);
    if (!/^\/[a-z0-9-]+$/.test(String(benchmark.route || '')) || routes.has(benchmark.route)) issues.push(`${label}:unique-route`);
    routes.add(benchmark.route);
    if (!ORACLES[benchmark.oracle]) issues.push(`${label}:known-oracle`);
    if (benchmark.referenceType !== 'closed-form-identity') issues.push(`${label}:reference-type`);
    if (!String(benchmark.referenceBasis || '').trim()) issues.push(`${label}:reference-basis`);
    if (!benchmark.input || typeof benchmark.input !== 'object' || Array.isArray(benchmark.input)) issues.push(`${label}:input-object`);
    if (!Array.isArray(benchmark.assertions) || benchmark.assertions.length < 1) issues.push(`${label}:assertions-required`);
    const assertionPaths = new Set();
    for (const [assertionIndex, assertion] of (benchmark.assertions || []).entries()) {
      const assertionLabel = `${label}.assertions[${assertionIndex}]`;
      exactKeys(assertion, ASSERTION_KEYS, assertionLabel, issues);
      if (!assertion.path || assertionPaths.has(assertion.path)) issues.push(`${assertionLabel}:unique-path`);
      assertionPaths.add(assertion.path);
      if (!Number.isFinite(assertion.absTolerance) || assertion.absTolerance < 0) issues.push(`${assertionLabel}:abs-tolerance`);
    }
  }

  const targetRoutes = new Set();
  for (const [index, target] of (catalog?.priorityTargets || []).entries()) {
    const label = `priorityTarget[${index}]`;
    exactKeys(target, TARGET_KEYS, label, issues);
    if (!/^\/[a-z0-9-]+$/.test(String(target.route || '')) || targetRoutes.has(target.route)) issues.push(`${label}:unique-route`);
    targetRoutes.add(target.route);
    if (target.priority !== 'P0') issues.push(`${label}:priority`);
    if (!String(target.evidenceNeeded || '').trim()) issues.push(`${label}:evidence-needed`);
    if (routes.has(target.route)) issues.push(`${label}:already-benchmarked`);
  }
  return issues;
}

function closeEnough(actual, expected, absTolerance) {
  if (actual === Infinity && expected === Infinity) return true;
  if (actual === -Infinity && expected === -Infinity) return true;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= absTolerance;
}

function runBenchmarks(catalog, options = {}) {
  const catalogIssues = validateCatalog(catalog);
  if (catalogIssues.length) {
    return {
      schemaVersion: 1,
      kind: 'independent-engineering-benchmarks-result.v1',
      generatedAt: new Date().toISOString(),
      status: 'blocked',
      summary: {
        eligibleFormalRoutes: Number(catalog?.portfolio?.eligibleFormalRoutes) || 0,
        pilotRequired: Array.isArray(catalog?.benchmarks) ? catalog.benchmarks.length : 0,
        pilotVerified: 0,
        independentlyVerifiedRoutes: 0,
        priorityTargets: Array.isArray(catalog?.priorityTargets) ? catalog.priorityTargets.length : 0,
        issueCount: catalogIssues.length
      },
      records: [],
      issues: catalogIssues
    };
  }

  const loadModule = options.loadProduction || loadProductionModule;
  const records = [];
  const issues = [];
  for (const benchmark of catalog.benchmarks) {
    const recordIssues = [];
    let production;
    let expected;
    try {
      const moduleApi = loadModule(benchmark.productionModule, benchmark);
      if (!moduleApi || typeof moduleApi.calculate !== 'function') throw new Error('calculate-export-required');
      const validationErrors = typeof moduleApi.validateInput === 'function' ? moduleApi.validateInput(benchmark.input) : [];
      if (validationErrors.length) throw new Error(`production-input-invalid:${validationErrors.join('|')}`);
      production = moduleApi.calculate(benchmark.input);
      expected = ORACLES[benchmark.oracle](benchmark.input);
    } catch (error) {
      recordIssues.push(`benchmark-execution:${error.message}`);
    }
    if (production && expected) {
      for (const assertion of benchmark.assertions) {
        const actualValue = getPath(production, assertion.path);
        const expectedValue = getPath(expected, assertion.path);
        if (!closeEnough(actualValue, expectedValue, assertion.absTolerance)) {
          recordIssues.push(`benchmark-value-mismatch:${assertion.path}:actual=${actualValue}:expected=${expectedValue}`);
        }
      }
    }
    issues.push(...recordIssues.map(issue => `${benchmark.id}:${issue}`));
    records.push({
      id: benchmark.id,
      route: benchmark.route,
      title: benchmark.title,
      status: recordIssues.length ? 'blocked' : 'verified',
      referenceType: benchmark.referenceType,
      referenceBasis: benchmark.referenceBasis,
      assertionCount: benchmark.assertions.length,
      issues: recordIssues
    });
  }
  const pilotVerified = records.filter(record => record.status === 'verified').length;
  return {
    schemaVersion: 1,
    kind: 'independent-engineering-benchmarks-result.v1',
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 && pilotVerified === catalog.benchmarks.length ? 'ready' : 'blocked',
    summary: {
      eligibleFormalRoutes: catalog.portfolio.eligibleFormalRoutes,
      pilotRequired: catalog.benchmarks.length,
      pilotVerified,
      independentlyVerifiedRoutes: new Set(records.filter(record => record.status === 'verified').map(record => record.route)).size,
      priorityTargets: catalog.priorityTargets.length,
      issueCount: issues.length
    },
    records,
    priorityTargets: catalog.priorityTargets,
    issues
  };
}

function parseArgs(argv) {
  const args = { catalogPath: defaultCatalogPath, outputPath: defaultOutputPath, json: false, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') args.json = true;
    else if (token === '--write') args.write = true;
    else if (token === '--catalog') args.catalogPath = path.resolve(argv[++index] || '');
    else if (token === '--output') args.outputPath = path.resolve(argv[++index] || '');
    else throw new Error(`unknown-argument:${token}`);
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const catalog = JSON.parse(fs.readFileSync(args.catalogPath, 'utf8').replace(/^\uFEFF/, ''));
  const result = runBenchmarks(catalog);
  if (args.write) {
    fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
    fs.writeFileSync(args.outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Independent engineering benchmarks: ${result.status}; pilot ${result.summary.pilotVerified}/${result.summary.pilotRequired}; formal portfolio ${result.summary.independentlyVerifiedRoutes}/${result.summary.eligibleFormalRoutes}; issues ${result.summary.issueCount}\n`);
  }
  return result.status === 'ready' ? 0 : 2;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 3;
  }
}

module.exports = {
  ORACLES,
  validateCatalog,
  runBenchmarks,
  main
};
