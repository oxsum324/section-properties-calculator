const path = require('path');
const Module = require('module');

const repoRoot = path.resolve(__dirname, '../../..');
const anchorSourceRoot = path.join(repoRoot, '螺栓檢討', 'bolt-review-tool', 'src');
const typescript = require(path.join(repoRoot, '螺栓檢討', 'bolt-review-tool', 'node_modules', 'typescript'));
const originalTsLoader = Module._extensions['.ts'];
Module._extensions['.ts'] = function loadTypeScript(currentModule, filename) {
  const source = require('fs').readFileSync(filename, 'utf8');
  const compiled = typescript.transpileModule(source, {
    fileName:filename,
    compilerOptions:{
      module:typescript.ModuleKind.CommonJS,
      target:typescript.ScriptTarget.ES2022,
      esModuleInterop:true,
      moduleResolution:typescript.ModuleResolutionKind.Node10,
      jsx:typescript.JsxEmit.ReactJSX
    }
  });
  currentModule._compile(compiled.outputText, filename);
};
let productionApi;
try {
  global.__APP_COMMIT_HASH__ = 'independent-engineering-benchmark';
  global.__APP_BUILD_TIME__ = '1970-01-01T00:00:00.000Z';
  const { evaluateProject } = require(path.join(anchorSourceRoot, 'calc.ts'));
  const { defaultProject, defaultProducts } = require(path.join(anchorSourceRoot, 'defaults.ts'));
  productionApi = { evaluateProject, defaultProject, defaultProducts };
} finally {
  delete global.__APP_COMMIT_HASH__;
  delete global.__APP_BUILD_TIME__;
  if (originalTsLoader) Module._extensions['.ts'] = originalTsLoader;
  else delete Module._extensions['.ts'];
}
const { evaluateProject, defaultProject, defaultProducts } = productionApi;

function validateInput(input) {
  const issues = [];
  const positive = [
    'diameterMm', 'effectiveAreaMm2', 'steelYieldStrengthMpa', 'steelUltimateStrengthMpa',
    'headBearingAreaMm2', 'effectiveEmbedmentMm', 'concreteStrengthMpa', 'concreteWidthMm',
    'concreteHeightMm', 'thicknessMm', 'spacingXmm', 'spacingYmm', 'edgeLeftMm',
    'edgeRightMm', 'edgeBottomMm', 'edgeTopMm', 'tensionKn'
  ];
  for (const key of positive) {
    if (!Number.isFinite(Number(input?.[key])) || Number(input[key]) <= 0) issues.push(`${key}:positive-finite-required`);
  }
  for (const key of ['shearXKn', 'shearYKn']) {
    if (!Number.isFinite(Number(input?.[key]))) issues.push(`${key}:finite-required`);
  }
  if (Number(input?.anchorCountX) !== 2 || Number(input?.anchorCountY) !== 2) issues.push('anchorCount:2x2-required');
  return issues;
}

function findResult(review, id) {
  const result = review.results.find(item => item.id === id);
  if (!result) throw new Error(`missing-anchor-result:${id}`);
  return result;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-anchor-benchmark-input:${issues.join(',')}`);
  const productTemplate = defaultProducts.find(product => product.id === 'generic-cast-m20');
  if (!productTemplate) throw new Error('missing-production-anchor-template:generic-cast-m20');
  const product = {
    ...productTemplate,
    family:'cast_in',
    diameterMm:Number(input.diameterMm),
    effectiveAreaMm2:Number(input.effectiveAreaMm2),
    steelYieldStrengthMpa:Number(input.steelYieldStrengthMpa),
    steelUltimateStrengthMpa:Number(input.steelUltimateStrengthMpa),
    headBearingAreaMm2:Number(input.headBearingAreaMm2),
    hookExtensionMm:undefined,
    evaluation:{ ...productTemplate.evaluation }
  };
  const project = {
    ...defaultProject,
    selectedProductId:product.id,
    layout:{
      ...defaultProject.layout,
      concreteWidthMm:Number(input.concreteWidthMm),
      concreteHeightMm:Number(input.concreteHeightMm),
      thicknessMm:Number(input.thicknessMm),
      concreteStrengthMpa:Number(input.concreteStrengthMpa),
      crackedConcrete:true,
      lightweightConcrete:false,
      supplementaryReinforcement:false,
      shearHairpinReinforcement:false,
      anchorReinforcementEnabled:false,
      effectiveEmbedmentMm:Number(input.effectiveEmbedmentMm),
      anchorCountX:2,
      anchorCountY:2,
      anchorLayoutPattern:'grid',
      spacingXmm:Number(input.spacingXmm),
      spacingYmm:Number(input.spacingYmm),
      edgeLeftMm:Number(input.edgeLeftMm),
      edgeRightMm:Number(input.edgeRightMm),
      edgeBottomMm:Number(input.edgeBottomMm),
      edgeTopMm:Number(input.edgeTopMm)
    },
    loads:{
      ...defaultProject.loads,
      tensionKn:Number(input.tensionKn),
      shearXKn:Number(input.shearXKn),
      shearYKn:Number(input.shearYKn),
      momentXKnM:0,
      momentYKnM:0,
      shearEccentricityXmm:0,
      shearEccentricityYmm:0,
      shearLeverArmMm:0,
      shearAnchorCount:2,
      interactionEquation:'linear',
      considerSeismic:false
    }
  };
  const review = evaluateProject(project, product);
  const steelTension = findResult(review, 'steel-tension');
  const tensionBreakout = findResult(review, 'concrete-breakout-tension');
  const pullout = findResult(review, 'pullout');
  const steelShear = findResult(review, 'steel-shear');
  const shearBreakout = findResult(review, 'concrete-breakout-shear');
  const pryout = findResult(review, 'pryout');
  const interaction = findResult(review, 'interaction');
  const output = {
    anchorCount:review.anchorPoints.length,
    maxAnchorTension:Math.max(...review.visualization.anchors.map(anchor => anchor.appliedTensionKn)),
    steelTensionNominal:steelTension.nominalStrengthKn,
    steelTensionDesign:steelTension.designStrengthKn,
    steelTensionDemand:steelTension.demandKn,
    steelTensionDcr:steelTension.dcr,
    tensionBreakoutNominal:tensionBreakout.nominalStrengthKn,
    tensionBreakoutDesign:tensionBreakout.designStrengthKn,
    tensionBreakoutDemand:tensionBreakout.demandKn,
    tensionBreakoutDcr:tensionBreakout.dcr,
    pulloutNominal:pullout.nominalStrengthKn,
    pulloutDesign:pullout.designStrengthKn,
    pulloutDemand:pullout.demandKn,
    pulloutDcr:pullout.dcr,
    steelShearNominal:steelShear.nominalStrengthKn,
    steelShearDesign:steelShear.designStrengthKn,
    steelShearDemand:steelShear.demandKn,
    steelShearDcr:steelShear.dcr,
    shearBreakoutNominal:shearBreakout.nominalStrengthKn,
    shearBreakoutDesign:shearBreakout.designStrengthKn,
    shearBreakoutDemand:shearBreakout.demandKn,
    shearBreakoutDcr:shearBreakout.dcr,
    pryoutNominal:pryout.nominalStrengthKn,
    pryoutDesign:pryout.designStrengthKn,
    pryoutDemand:pryout.demandKn,
    pryoutDcr:pryout.dcr,
    interactionDemand:interaction.demandKn,
    interactionCapacity:interaction.designStrengthKn,
    interactionDcr:interaction.dcr,
    tensionBreakoutControls:review.summary.governingTensionMode === '混凝土拉破強度' ? 1 : 0,
    shearBreakoutControls:review.summary.governingShearMode === '混凝土剪破強度' ? 1 : 0,
    interactionControls:review.summary.governingDcr === interaction.dcr ? 1 : 0,
    governingDcr:review.summary.governingDcr,
    maxDcr:review.summary.maxDcr,
    overallPass:review.summary.overallStatus === 'pass' ? 1 : 0,
    formalPass:review.summary.formalStatus === 'pass' ? 1 : 0
  };
  return output;
}

module.exports = { validateInput, calculate };
