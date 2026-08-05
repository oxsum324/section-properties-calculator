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

function rcFoundationOracle(i) {
  const dX = i.hf - i.cover - i.dbX;
  const dY = i.hf - i.cover - i.dbY;
  const d = Math.min(dX, dY);
  const areaM2 = i.B * i.L / 1e4;
  const quTfM2 = i.PuTf / areaM2;
  const quKgfCm2 = quTfM2 / 10;
  const armX = (i.L - i.c1) / 2;
  const armY = (i.B - i.c2) / 2;
  const MuxKgfCm = quKgfCm2 * i.B * armX * armX / 2;
  const MuyKgfCm = quKgfCm2 * i.L * armY * armY / 2;
  const AsProvX = i.AsXPerM * i.B / 100;
  const AsProvY = i.AsYPerM * i.L / 100;

  function flexuralCapacity(width, depth, steelArea) {
    const a = steelArea * i.fy / (0.85 * i.fc * width);
    const c = a / i.beta1;
    const epsT = 0.003 * (depth - c) / c;
    const epsY = i.fy / i.Es;
    const phi = epsT >= 0.005 ? 0.9 : (epsT <= epsY ? 0.65 : 0.65 + 0.25 * (epsT - epsY) / (0.005 - epsY));
    return phi * steelArea * i.fy * (depth - a / 2) / 1e5;
  }

  function requiredSteel(width, depth, momentKgfCm) {
    const coefficient = i.fy * i.fy / (1.7 * i.fc * width);
    const linear = i.fy * depth;
    const discriminant = linear * linear - 4 * coefficient * momentKgfCm / 0.9;
    return (linear - Math.sqrt(discriminant)) / (2 * coefficient);
  }

  const flexuralAsX = requiredSteel(i.B, dX, MuxKgfCm);
  const flexuralAsY = requiredSteel(i.L, dY, MuyKgfCm);
  const AsMinPerM = 0.0018 * 100 * i.hf;
  const AsReqX = Math.max(flexuralAsX, AsMinPerM * i.B / 100);
  const AsReqY = Math.max(flexuralAsY, AsMinPerM * i.L / 100);
  const v1Arm = Math.max(0, Math.max(armX, armY) - d);
  const Vu1Kgf = quKgfCm2 * i.B * v1Arm;
  const phiVc1Kgf = i.phiShear * 0.53 * i.lambda * Math.sqrt(i.fc) * i.B * d;
  const c1d = i.c1 + d;
  const c2d = i.c2 + d;
  const bo = 2 * (c1d + c2d);
  const criticalAreaM2 = c1d * c2d / 1e4;
  const Vu2Kgf = (i.PuTf - quTfM2 * criticalAreaM2) * 1000;
  const betaC = Math.max(i.c1, i.c2) / Math.min(i.c1, i.c2);
  const vc = Math.min(
    1.06 * i.lambda * Math.sqrt(i.fc),
    0.27 * (2 + 4 / betaC) * i.lambda * Math.sqrt(i.fc),
    0.27 * (40 * d / bo + 2) * i.lambda * Math.sqrt(i.fc)
  );
  const phiVc2Kgf = i.phiShear * vc * bo * d;
  return {
    dX,
    dY,
    quTfM2,
    MuxTfm: MuxKgfCm / 1e5,
    MuyTfm: MuyKgfCm / 1e5,
    phiMnXTfm: flexuralCapacity(i.B, dX, AsProvX),
    phiMnYTfm: flexuralCapacity(i.L, dY, AsProvY),
    flexuralAsX,
    flexuralAsY,
    AsReqX,
    AsReqY,
    Vu1Tf: Vu1Kgf / 1000,
    phiVc1Tf: phiVc1Kgf / 1000,
    bo,
    Vu2Tf: Vu2Kgf / 1000,
    phiVc2Tf: phiVc2Kgf / 1000
  };
}

function rcPileOracle(i) {
  const layer = i.layers[0];
  const alpha = layer.c <= 3 ? 0.9 : layer.c <= 6 ? 0.7 : 0.55;
  const perimeter = Math.PI * i.pileDiameterM;
  const pileAreaM2 = Math.PI * i.pileDiameterM * i.pileDiameterM / 4;
  const Qs = alpha * layer.c * perimeter * i.pileLength;
  const Qb = 9 * layer.c * pileAreaM2;
  const Qult = Qs + Qb;

  const xs = [];
  const ys = [];
  for (let xIndex = 0; xIndex < i.pileNL; xIndex++) {
    for (let yIndex = 0; yIndex < i.pileNB; yIndex++) {
      xs.push((xIndex - (i.pileNL - 1) / 2) * i.pileSL);
      ys.push((yIndex - (i.pileNB - 1) / 2) * i.pileSB);
    }
  }
  const sumX2 = xs.reduce((sum, value) => sum + value * value, 0);
  const sumY2 = ys.reduce((sum, value) => sum + value * value, 0);
  const reactions = xs.map((x, index) => (
    i.PuTf / xs.length
    + i.MxTfm * 100 * ys[index] / sumY2
    + i.MyTfm * 100 * x / sumX2
  ));
  const rowL = Array.from({ length:i.pileNL }, (_, xIndex) => (
    reactions.slice(xIndex * i.pileNB, (xIndex + 1) * i.pileNB).reduce((sum, value) => sum + Math.max(value, 0), 0)
  ));
  const rowB = Array.from({ length:i.pileNB }, (_, yIndex) => (
    Array.from({ length:i.pileNL }, (_, xIndex) => reactions[xIndex * i.pileNB + yIndex])
      .reduce((sum, value) => sum + Math.max(value, 0), 0)
  ));

  const d = i.hc - i.cover - i.db;
  const c1d = i.c1 + d;
  const c2d = i.c2 + d;
  const bo = 2 * (c1d + c2d);
  const betaC = Math.max(i.c1, i.c2) / Math.min(i.c1, i.c2);
  const vc = Math.min(
    1.06 * i.lambda * Math.sqrt(i.fc),
    0.27 * (2 + 4 / betaC) * i.lambda * Math.sqrt(i.fc),
    0.27 * (40 * d / bo + 2) * i.lambda * Math.sqrt(i.fc)
  );
  let excludedCount = 0;
  let Vu2Tf = 0;
  reactions.forEach((reaction, index) => {
    const dx = Math.abs(xs[index]) - c1d / 2;
    const dy = Math.abs(ys[index]) - c2d / 2;
    const distance = dx <= 0 && dy <= 0 ? 0 : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    if (distance < i.pileD / 2) excludedCount += 1;
    else Vu2Tf += Math.max(reaction, 0);
  });

  const rowSpanL = (i.pileNL - 1) * i.pileSL / 100;
  const rowSpanB = (i.pileNB - 1) * i.pileSB / 100;
  const controlRowL = Math.max(...rowL);
  const controlRowB = Math.max(...rowB);
  const capMuLongTfm = controlRowL * rowSpanL / 8;
  const capMuTransTfm = controlRowB * rowSpanB / 8;
  const capMuTfm = Math.max(capMuLongTfm, capMuTransTfm);
  const capVuTf = Math.max(controlRowL / 2, controlRowB / 2, ...reactions);
  const momentKgfCm = capMuTfm * 1e5;
  const width = 100;
  const quadratic = i.fy * i.fy / (1.7 * i.fc * width);
  const linear = i.fy * d;
  const capFlexuralAs = (linear - Math.sqrt(linear * linear - 4 * quadratic * momentKgfCm / 0.9)) / (2 * quadratic);
  const capAsReq = Math.max(0.0018 * width * i.hc, capFlexuralAs);
  const capAsProv = Math.max(i.capSteelAreaTotal / 2, capAsReq);
  const a = capAsProv * i.fy / (0.85 * i.fc * width);
  const capPhiMnTfm = 0.9 * capAsProv * i.fy * (d - a / 2) / 1e5;
  const capPhiVcTf = i.phiShear * 0.53 * i.lambda * Math.sqrt(i.fc) * width * d / 1000;
  const capVsTf = 11.4 * 2800 * d / 10 / 1000;

  return {
    Qs,
    Qb,
    Qult,
    Qall: Qult / i.safetyFactor,
    reaction1: reactions[0],
    reaction2: reactions[1],
    reaction3: reactions[2],
    reaction4: reactions[3],
    reactionSum: reactions.reduce((sum, value) => sum + value, 0),
    rMax: Math.max(...reactions),
    rMin: Math.min(...reactions),
    d,
    Vu2Tf,
    phiVc2Tf: i.phiShear * vc * bo * d / 1000,
    excludedCount,
    rowL1: rowL[0],
    rowL2: rowL[1],
    rowB1: rowB[0],
    rowB2: rowB[1],
    capMuLongTfm,
    capMuTransTfm,
    capMuTfm,
    capVuTf,
    capFlexuralAs,
    capAsReq,
    capPhiMnTfm,
    capPhiVnTf: capPhiVcTf + capVsTf
  };
}

function steelBeamAsdOracle(i) {
  const E = 2.04e6;
  const H = i.H / 10;
  const B = i.B / 10;
  const tw = i.tw / 10;
  const tf = i.tf / 10;
  const hw = H - 2 * tf;
  const A = 2 * B * tf + hw * tw;
  const Ix = 2 * (B * tf ** 3 / 12 + B * tf * ((H - tf) / 2) ** 2) + tw * hw ** 3 / 12;
  const Iy = 2 * tf * B ** 3 / 12 + hw * tw ** 3 / 12;
  const Sx = Ix / (H / 2);
  const Zx = 2 * (B * tf * (H / 2 - tf / 2) + tw * (hw / 2) * (hw / 4));
  const ry = Math.sqrt(Iy / A);
  const J = (2 * B * tf ** 3 + hw * tw ** 3) / 3;
  const ho = H - tf;
  const Cw = Iy * ho ** 2 / 4;
  const rts = Math.sqrt(Iy * ho / (2 * Sx));
  const lambdaF = B / (2 * tf);
  const lambdaW = hw / tw;
  const lpf = 0.38 * Math.sqrt(E / i.Fy);
  const lrf = Math.sqrt(E / i.Fy);
  const lpw = 3.76 * Math.sqrt(E / i.Fy);
  const lrw = 5.70 * Math.sqrt(E / i.Fy);

  const Mp = i.Fy * Zx;
  const Mr = 0.7 * i.Fy * Sx;
  const Lp = 1.76 * ry * Math.sqrt(E / i.Fy);
  const arg = J / (Sx * ho);
  const Lr = 1.95 * rts * E / (0.7 * i.Fy)
    * Math.sqrt(arg + Math.sqrt(arg ** 2 + 6.76 * (0.7 * i.Fy / E) ** 2));
  const MnLtb = Math.min(i.Cb * (Mp - (Mp - Mr) * (i.Lb - Lp) / (Lr - Lp)), Mp);
  const MnYield = Mp;
  const MnFlb = Mp;
  const Mn = Math.min(MnYield, MnLtb, MnFlb);

  const Aw = hw * tw;
  const shearRatio = hw / tw;
  const kv = 5.34;
  const compactShearWeb = shearRatio <= 2.24 * Math.sqrt(E / i.Fy);
  let Cv1;
  if (compactShearWeb || shearRatio <= 1.10 * Math.sqrt(kv * E / i.Fy)) Cv1 = 1;
  else if (shearRatio <= 1.37 * Math.sqrt(kv * E / i.Fy)) Cv1 = 1.10 * Math.sqrt(kv * E / i.Fy) / shearRatio;
  else Cv1 = 1.51 * kv * E / (shearRatio ** 2 * i.Fy);
  const Vn = 0.6 * i.Fy * Aw * Cv1;
  const EI = E * Ix;
  const deltaD = 5 * i.wD * i.L ** 4 / (384 * EI);
  const deltaL = 5 * i.wL * i.L ** 4 / (384 * EI);
  const deltaT = deltaD + deltaL;

  return {
    A, Ix, Iy, Sx, Zx, ry, J, Cw, ho, rts,
    lambdaF, lambdaW, lpf, lrf, lpw, lrw,
    compactFlange: lambdaF <= lpf ? 1 : 0,
    compactWeb: lambdaW <= lpw ? 1 : 0,
    Lp, Lr,
    inelasticLtb: i.Lb > Lp && i.Lb <= Lr ? 1 : 0,
    governingLtb: MnLtb < MnYield && MnLtb <= MnFlb ? 1 : 0,
    Mp, Mr, MnYield, MnLtb, MnFlb, Mn,
    MnOmegaTfm: Mn / 1.67 / 1e5,
    Cv1,
    compactShearWeb: compactShearWeb ? 1 : 0,
    VnTf: Vn / 1000,
    VnOmegaTf: Vn / (compactShearWeb ? 1.5 : 1.67) / 1000,
    EI,
    deltaD,
    deltaL,
    deltaT,
    ratioL: i.L / deltaL,
    ratioT: i.L / deltaT,
    allowLive: i.L / i.limitLive,
    allowTotal: i.L / i.limitTotal
  };
}

const ORACLES = {
  'equipment-basic-load-path': equipmentOracle,
  'earth-rankine-dry-active': earthOracle,
  'foundation-external-load-only': foundationOracle,
  'rc-column-balanced-nearby-pm-point': rcColumnPmOracle,
  'rc-foundation-isolated-strength': rcFoundationOracle,
  'rc-pile-clay-group-cap': rcPileOracle,
  'steel-beam-asd-inelastic-ltb': steelBeamAsdOracle
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
