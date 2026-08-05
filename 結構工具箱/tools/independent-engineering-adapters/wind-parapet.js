const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionCorePath = path.resolve(__dirname, '../../core/loads/wind.js');
const formalPagePath = path.resolve(__dirname, '../風力/wind-parapet.html');
const productionSource = fs.readFileSync(productionCorePath, 'utf8');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');

const requiredFormalCalls = [
  'r = W.calcMwfrsParapet({ V, terrain, I, Kzt, h, hp, face });',
  "const caseList = (ccType === 'single_roof' ? W.calcSingleRoofParapetCcCases : W.calcParapetCcCases)({",
];
for (const call of requiredFormalCalls) {
  if (!formalPageSource.includes(call)) throw new Error('wind-parapet-formal-page-wiring-drift');
}

const context = { window:{}, Math, console };
vm.createContext(context);
vm.runInContext(productionSource, context, { filename:productionCorePath });
const Wind = context.window.Wind;

function validateCommon(item, label, { areaRequired = false } = {}) {
  const issues = [];
  for (const key of ['V', 'I', 'Kzt', 'h', 'hp']) {
    if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${label}.${key}:positive-finite-required`);
  }
  if (!['A', 'B', 'C'].includes(item?.terrain)) issues.push(`${label}.terrain:A-B-C-required`);
  if (areaRequired) {
    if (!Number.isFinite(Number(item?.A)) || Number(item.A) <= 0) issues.push(`${label}.A:positive-finite-required`);
    if (!['enclosed', 'partial', 'open'].includes(item?.encl)) issues.push(`${label}.encl:known-required`);
    if (item?.GCpiOverride != null && (!Number.isFinite(Number(item.GCpiOverride)) || Number(item.GCpiOverride) < 0)) {
      issues.push(`${label}.GCpiOverride:nonnegative-finite-or-null-required`);
    }
  }
  return issues;
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['input:object-required'];
  return [
    ...validateCommon(input.mwfrs, 'mwfrs'),
    ...validateCommon(input.buildingCc, 'buildingCc', { areaRequired:true }),
    ...validateCommon(input.singleCc, 'singleCc', { areaRequired:true }),
  ];
}

function summarizeCases(cases) {
  const control = cases.reduce(
    (best, item) => Math.abs(item.data.pDiff) > Math.abs(best.data.pDiff) ? item : best,
    cases[0]
  );
  const output = {
    caseCount:cases.length,
    qp:cases[0].data.qp,
    topZ:cases[0].data.topZ,
    gcpi:cases[0].data.GCpi,
    isLE18:cases[0].data.isLE18 ? 1 : 0,
  };
  for (const item of cases) {
    output[item.key] = {
      frontGCp:item.data.frontGCp,
      backGCp:item.data.backGCp,
      pFront:item.data.pFront,
      pBack:item.data.pBack,
      pDiff:item.data.pDiff,
      controls:item.key === control.key ? 1 : 0,
    };
  }
  return output;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-wind-parapet-benchmark-input:${issues.join(',')}`);
  const windward = Wind.calcMwfrsParapet({ ...input.mwfrs, face:'windward' });
  const leeward = Wind.calcMwfrsParapet({ ...input.mwfrs, face:'leeward' });
  return {
    mwfrs:{
      qp:windward.qp,
      topZ:windward.topZ,
      windwardGCpn:windward.GCpn,
      windwardP:windward.p,
      leewardGCpn:leeward.GCpn,
      leewardP:leeward.p,
    },
    buildingCc:summarizeCases(Wind.calcParapetCcCases(input.buildingCc)),
    singleCc:summarizeCases(Wind.calcSingleRoofParapetCcCases(input.singleCc)),
  };
}

module.exports = { validateInput, calculate };
