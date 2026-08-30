const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionPagePath = path.resolve(__dirname, '../../../鋼架/平面剛架分析.html');
const productionPageSource = fs.readFileSync(productionPagePath, 'utf8');

const requiredProductionWiring = [
  'function analyze(loadFactorOverride = null)',
  'const EI = m.E * m.I * 1e-4;',
  'const df = freeDofs.length ? solveLinear(Kff, Ff) : [];',
  'solverDiagnostics, elems: elemResults, validation, equilibrium',
];
for (const token of requiredProductionWiring) {
  if (!productionPageSource.includes(token)) throw new Error(`frame-analysis-page-contract-missing:${token}`);
}

function extractFunctionDeclaration(name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^function\\s+${escapedName}\\s*\\(`, 'm').exec(productionPageSource);
  if (!match) throw new Error(`frame-analysis-production-function-missing:${name}`);
  const start = match.index;
  const bodyStart = productionPageSource.indexOf('{', start);
  for (let cursor = bodyStart; cursor < productionPageSource.length; cursor += 1) {
    if (productionPageSource[cursor] !== '}') continue;
    const candidate = productionPageSource.slice(start, cursor + 1);
    try {
      new vm.Script(`(${candidate})`);
      return candidate;
    } catch (_) {
      // A nested block, string or template expression may end here; keep scanning
      // until the complete production declaration parses on its own.
    }
  }
  throw new Error(`frame-analysis-production-function-unclosed:${name}`);
}

const solverFunctionNames = [
  'asNonNegativeNumber',
  'springValue',
  'activeSpring',
  'hasSupportDof',
  'ensureLoadCases',
  'normalizedCombinationFactors',
  'firstLoadCaseId',
  'normalizeLoadCaseId',
  'comboFactor',
  'formatCombinationFactors',
  'activeLoadFactors',
  'momentAboutOrigin',
  'computeAppliedResultant',
  'validateModel',
  'zeros',
  'matmul',
  'matvec',
  'transpose',
  'subtractMat',
  'invSmall',
  'condenseReleases',
  'solveLinear',
  'analyze',
];
const extractedSolverSource = solverFunctionNames.map(extractFunctionDeclaration).join('\n\n');

function validateInput(input) {
  const issues = [];
  for (const key of ['lengthM', 'tipLoadTf', 'elasticModulusTfCm2', 'areaCm2', 'inertiaCm4']) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
  }
  return issues;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-frame-analysis-benchmark-input:${issues.join(',')}`);

  const lengthM = Number(input.lengthM);
  const tipLoadTf = Number(input.tipLoadTf);
  const elasticModulusTfCm2 = Number(input.elasticModulusTfCm2);
  const areaCm2 = Number(input.areaCm2);
  const inertiaCm4 = Number(input.inertiaCm4);
  const state = {
    nodes: [
      { id:1, x:0, y:0, cx:true, cy:true, crz:true, kx:0, ky:0, krz:0 },
      { id:2, x:lengthM, y:0, cx:false, cy:false, crz:false, kx:0, ky:0, krz:0 },
    ],
    members: [
      { id:1, i:1, j:2, E:elasticModulusTfCm2, A:areaCm2, I:inertiaCm4, relI:false, relJ:false },
    ],
    loadCases: [{ id:1, name:'L' }],
    comboFactors: { 1:1 },
    loadCombinations: [{ id:1, name:'L', factors:{ 1:1 } }],
    activeCombinationId: 1,
    nodalLoads: [{ node:2, Fx:0, Fy:-tipLoadTf, M:0, caseId:1 }],
    memberLoads: [],
    memberPointLoads: [],
    foundationTransfer: null,
    solution: null,
  };
  const document = {
    getElementById(id) {
      if (id === 'selfWeight') return { checked:false };
      if (id === 'density') return { value:'0' };
      return null;
    },
  };
  const context = { state, document, Math, Map, Set };
  vm.createContext(context);
  vm.runInContext(`${extractedSolverSource}\nthis.__productionAnalyze = analyze;`, context, {
    filename: productionPagePath,
  });
  const result = context.__productionAnalyze({ 1:1 });
  const member = result.elems[0];
  return {
    tipHorizontalDisplacementM: result.d[3],
    tipVerticalDisplacementM: result.d[4],
    tipRotationRad: result.d[5],
    baseReactionFxTf: result.reactions[0],
    baseReactionFyTf: result.reactions[1],
    baseReactionMomentTfM: result.reactions[2],
    memberIEndShearTf: member.qLocal[1],
    memberIEndMomentTfM: member.qLocal[2],
    equilibriumResidualFxTf: result.equilibrium.residual.Fx,
    equilibriumResidualFyTf: result.equilibrium.residual.Fy,
    equilibriumResidualMomentTfM: result.equilibrium.residual.M,
    equilibriumPassed: result.equilibrium.ok ? 1 : 0,
  };
}

module.exports = { validateInput, calculate };
