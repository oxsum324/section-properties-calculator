const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionRoot = path.resolve(__dirname, '../../../石材固定');
const productionPagePath = path.join(productionRoot, '石材計算書產生器_規範版V2.html');
const productionConstantsPath = path.join(productionRoot, 'js', 'constants.spec.js');
const productionCalculatorPath = path.join(productionRoot, 'js', 'calculator.spec.js');
const productionPageSource = fs.readFileSync(productionPagePath, 'utf8');
const productionConstantsSource = fs.readFileSync(productionConstantsPath, 'utf8');
const productionCalculatorSource = fs.readFileSync(productionCalculatorPath, 'utf8');

for (const token of [
  '<script src="./js/constants.spec.js"></script>',
  '<script src="./js/calculator.spec.js"></script>',
]) {
  if (!productionPageSource.includes(token)) throw new Error(`stone-fixing-page-contract-missing:${token}`);
}
for (const token of [
  'window.STONE_CONSTANTS = Object.freeze({',
  'ANCHOR_CATALOG: Object.freeze({',
]) {
  if (!productionConstantsSource.includes(token)) throw new Error(`stone-fixing-constants-contract-missing:${token}`);
}
for (const token of [
  'window.StoneCalculator = (() => {',
  'function calcCase(cd, inp)',
  'function anchorCapacity(inp)',
  'function panelCheck(cd, inp, loadCtx)',
  'function buildCaseCheckData(cd, result, inp)',
]) {
  if (!productionCalculatorSource.includes(token)) throw new Error(`stone-fixing-calculator-contract-missing:${token}`);
}

function validateInput(input) {
  const issues = [];
  if (!Array.isArray(input?.cases) || input.cases.length < 2) return ['cases:two-or-more-required'];
  const ids = new Set();
  input.cases.forEach((item, index) => {
    const prefix = `cases[${index}]`;
    if (!item?.id || ids.has(item.id)) issues.push(`${prefix}.id:unique-required`);
    ids.add(item?.id);
    if (!item?.caseData || typeof item.caseData !== 'object') issues.push(`${prefix}.caseData:object-required`);
    if (!item?.global || typeof item.global !== 'object') issues.push(`${prefix}.global:object-required`);
    for (const field of ['w', 'h', 'N', 'bh', 'd1', 'Lt', 'LL', 'd0']) {
      if (!Number.isFinite(Number(item?.caseData?.[field])) || Number(item.caseData[field]) <= 0) {
        issues.push(`${prefix}.caseData.${field}:positive-finite-required`);
      }
    }
    for (const field of ['st_gam', 'st_t', 's_sds', 'w_cf', 'm_fy', 'm_anc_sf']) {
      if (!Number.isFinite(Number(item?.global?.[field])) || Number(item.global[field]) <= 0) {
        issues.push(`${prefix}.global.${field}:positive-finite-required`);
      }
    }
  });
  return issues;
}

function findCheck(result, prefix) {
  const check = result.checks.find(item => String(item.item).startsWith(prefix));
  if (!check) return { value: 0, limit: 0, pass: 0 };
  return { value: check.v, limit: check.a, pass: check.pass ? 1 : 0 };
}

function normalize(result) {
  const spec = result.spec;
  const panel = spec.panel;
  const drift = spec.drift;
  const thermal = spec.thermal;
  return {
    area: result.A,
    weightPerArea: result.Wp,
    gravity: result.G,
    ipEffective: spec.ipEffective,
    seismicPressure: result.Fph,
    seismicForce: result.PE,
    verticalSeismic: result.PEV,
    windPressurePos: result.pressurePos,
    windPressureNeg: result.pressureNeg,
    windForcePos: result.PWPos,
    windForceNeg: result.PWNeg,
    horizontalPull: result.design.horizontalPull,
    horizontalPush: result.design.horizontalPush,
    verticalDemand: result.S,
    tensionPerPoint: result.T,
    bendingPerPoint: result.design.bendingPerPoint,
    shearPerPoint: result.V,
    totalPoints: spec.pointCount.total,
    effectivePoints: spec.pointCount.effective,
    anchor: {
      vendorTa: spec.anchor.vendorAllow,
      vendorVa: spec.anchor.vendorAllowShear,
      appendixTa: spec.anchor.appendixTensionService,
      appendixVa: spec.anchor.appendixShearService,
      baseTa: spec.anchor.baseTa,
      baseVa: spec.anchor.baseVa,
      effectiveTa: spec.anchor.effectiveTa,
      effectiveVa: spec.anchor.effectiveVa,
      psiCn: spec.anchor.psiCn,
      psiCv: spec.anchor.psiCv,
      tensionFactor: spec.anchorGroup.tensionFactor,
      shearFactor: spec.anchorGroup.shearFactor,
    },
    panel: {
      spanX: panel.spanXmm,
      spanY: panel.spanYmm,
      q: panel.qPanel,
      moment: panel.moment,
      momentShort: panel.momentShort,
      momentLong: panel.momentLong,
      sectionModulus: panel.sectionModulus,
      bendingStress: panel.fb,
      localArea: panel.localArea,
      localStress: panel.localStress,
      pass: panel.pass ? 1 : 0,
    },
    drift: drift.enabled ? {
      displacement: drift.displacementMm,
      rotation: drift.rotationDemandDeg,
      pass: drift.pass ? 1 : 0,
    } : { displacement: 0, rotation: 0, pass: 1 },
    thermal: thermal.enabled ? {
      deltaWidth: thermal.deltaWidthMm,
      deltaHeight: thermal.deltaHeightMm,
      requiredJoint: thermal.requiredJointMm,
      pass: thermal.pass ? 1 : 0,
    } : { deltaWidth: 0, deltaHeight: 0, requiredJoint: 0, pass: 1 },
    checks: {
      screw: findCheck(result, '背扣螺絲'),
      anchorVertical: findCheck(result, '膨脹螺栓 Tu1'),
      anchorHorizontal: findCheck(result, '膨脹螺栓 Tu2'),
      anchorShear: findCheck(result, '膨脹螺栓 剪力'),
      anchorInteraction: findCheck(result, '膨脹螺栓 拉剪交互'),
      carriageShear: findCheck(result, '馬車螺栓 剪力'),
      carriageTension: findCheck(result, '馬車螺栓 拉力'),
      pin: findCheck(result, '插銷 剪力'),
      angleShear: findCheck(result, '角鋼 剪力'),
      angleBending: findCheck(result, '角鋼 彎矩'),
    },
    allPass: result.allOK ? 1 : 0,
  };
}

function createCalculator() {
  const context = { console, Math, window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(productionConstantsSource, context, { filename: productionConstantsPath });
  vm.runInContext(productionCalculatorSource, context, { filename: productionCalculatorPath });
  if (typeof context.window.StoneCalculator?.calcCase !== 'function') throw new Error('stone-fixing-production-api-missing');
  return context.window.StoneCalculator;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-stone-fixing-benchmark-input:${issues.join(',')}`);
  const calculator = createCalculator();
  return Object.fromEntries(input.cases.map(item => [
    item.id,
    normalize(calculator.calcCase(item.caseData, item.global)),
  ]));
}

module.exports = { validateInput, calculate };
