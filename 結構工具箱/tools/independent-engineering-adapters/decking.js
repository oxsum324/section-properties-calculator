const fs = require('fs');
const path = require('path');
const vm = require('vm');

const productionRoot = path.resolve(__dirname, '../../../覆工板');
const productionPagePath = path.join(productionRoot, 'index.html');
const productionSectionPath = path.join(productionRoot, 'shared', 'h-section-table.js');
const productionPageSource = fs.readFileSync(productionPagePath, 'utf8');
const productionSectionSource = fs.readFileSync(productionSectionPath, 'utf8');

for (const token of [
  'function calcDeck()',
  'function calcStringer()',
  'function calcGirder()',
  'function calcColumn()',
  'function calcBond()',
  'function calcPile()',
  'const Pu1 = c.Vmax',
  'const Qa = Qb/FSb + Qs/FSs',
]) {
  if (!productionPageSource.includes(token)) throw new Error(`decking-page-contract-missing:${token}`);
}
if (!productionSectionSource.includes('const H_SECTIONS = [')) throw new Error('decking-section-table-contract-missing');

const calculationStart = productionPageSource.indexOf('function classifyFlange');
const calculationEnd = productionPageSource.indexOf('function resultFailures', calculationStart);
if (calculationStart < 0 || calculationEnd <= calculationStart) throw new Error('decking-production-calculation-block-missing');
const productionCalculationSource = productionPageSource.slice(calculationStart, calculationEnd);

function validateInput(input) {
  const issues = [];
  if (!Array.isArray(input?.cases) || input.cases.length < 2) issues.push('cases:two-or-more-required');
  const ids = new Set();
  for (const [index, item] of (input?.cases || []).entries()) {
    const prefix = `cases[${index}]`;
    if (!item?.id || ids.has(item.id)) issues.push(`${prefix}.id:unique-required`);
    ids.add(item?.id);
    for (const [group, fields] of Object.entries({
      global: ['Fy', 'E', 'beta', 'Wp', 'defl'],
      deck: ['B', 'L', 'n', 'Sx', 'Ix', 'Aw', 'Pcrane'],
      stringer: ['n', 'B', 'L', 'Pcrane'],
      girder: ['n', 'B', 'L', 'W2', 'Pcrane'],
      column: ['L', 'K', 'N', 'old'],
      bond: ['fc', 'L', 'P'],
      pile: ['D', 'Lb', 'Nb', 'Ns', 'FSb', 'FSs', 'P'],
    })) {
      for (const field of fields) {
        if (!Number.isFinite(Number(item?.[group]?.[field])) || Number(item[group][field]) <= 0) {
          issues.push(`${prefix}.${group}.${field}:positive-finite-required`);
        }
      }
    }
    for (const group of ['stringer', 'girder', 'column']) {
      const section = item?.[group]?.section;
      for (const field of ['name', 'H', 'B', 'tw', 'tf', 'A', 'Wb', 'Ix', 'Iy', 'Sx', 'Sy', 'rx', 'ry']) {
        if (field === 'name' ? !String(section?.[field] || '').trim() : !Number.isFinite(Number(section?.[field]))) {
          issues.push(`${prefix}.${group}.section.${field}:required`);
        }
      }
    }
  }
  return issues;
}

function controlCode(label) {
  if (String(label).includes('PC400')) return 2;
  if (String(label).includes('吊車') || String(label).includes('45T')) return 3;
  return 1;
}

function normalize(R) {
  const member = value => ({
    WT: value.WT, P_HS: value.P_HS, Wc: value.Wc,
    M1: value.M1, M2: value.M2, M3: value.M3, Mmax: value.Mmax,
    V1: value.V1, V2: value.V2, V3: value.V3, Vmax: value.Vmax,
    control: controlCode(value.ctrl), Fb: value.Fb, fb: value.fb, Fv: value.Fv, fv: value.fv,
    d1: value.def3.d1, d2: value.def3.d2, d3: value.def3.d3, dmax: value.def3.dmax,
    deflectionControl: controlCode(value.def3.ctrl), defAllow: value.def_allow,
    flexurePass: value.ok_fb ? 1 : 0, shearPass: value.ok_fv ? 1 : 0, deflectionPass: value.ok_d ? 1 : 0,
  });
  return {
    deck: member(R.deck),
    stringer: { ...member(R.stringer), flangeCode: R.stringer.flange.code, webCode: R.stringer.web.code, braceCode: R.stringer.brace.code },
    girder: {
      ...member(R.girder), WT2: R.girder.WT2, flangeCode: R.girder.flange.code,
      webCode: R.girder.web.code, braceCode: R.girder.brace.code,
      Pu1: R.girder.Pu1, Pu2: R.girder.Pu2, Pu3: R.girder.Pu3, PuMax: R.girder.PuMax,
    },
    column: {
      fa: R.column.fa, Mx: R.column.Mx, My: R.column.My, fbx: R.column.fbx, fby: R.column.fby,
      KLrx: R.column.KLrx, KLry: R.column.KLry, Cc: R.column.Cc, Fa: R.column.Fa, Fa1: R.column.Fa1,
      Fbx: R.column.Fbx, Fby: R.column.Fby, chk1: R.column.chk1, chk2: R.column.chk2,
      worst: R.column.worst, pass: R.column.ok ? 1 : 0,
    },
    bond: { ls: R.bond.ls, tau: R.bond.tau, F: R.bond.F, Nc: R.bond.Nc, tensionPass: R.bond.ok_T ? 1 : 0, compressionPass: R.bond.ok_P ? 1 : 0, pass: R.bond.ok ? 1 : 0 },
    pile: { Ab: R.pile.Ab, qb: R.pile.qb, fs: R.pile.fs, Qb: R.pile.Qb, Qs: R.pile.Qs, Qa: R.pile.Qa, pass: R.pile.ok ? 1 : 0 },
  };
}

function calculateCase(item) {
  const values = {
    g_Fy: item.global.Fy, g_E: item.global.E, g_beta: item.global.beta, g_imp: item.global.imp,
    g_Wp: item.global.Wp, g_Wl: item.global.Wl, g_defl: item.global.defl,
    d_B: item.deck.B, d_L: item.deck.L, d_n: item.deck.n, d_Sx: item.deck.Sx,
    d_Ix: item.deck.Ix, d_Aw: item.deck.Aw, d_Pcrane: item.deck.Pcrane,
    s_section: item.stringer.section.name, s_n: item.stringer.n, s_B: item.stringer.B,
    s_L: item.stringer.L, s_Lt: item.stringer.Lt, s_fa: item.stringer.fa, s_Pcrane: item.stringer.Pcrane,
    g4_section: item.girder.section.name, g4_n: item.girder.n, g4_B: item.girder.B,
    g4_L: item.girder.L, g4_W2: item.girder.W2, g4_Lt: item.girder.Lt,
    g4_fa: item.girder.fa, g4_Pcrane: item.girder.Pcrane,
    c_section: item.column.section.name, c_L: item.column.L, c_K: item.column.K, c_N: item.column.N,
    c_ex: item.column.ex, c_ey: item.column.ey, c_old: item.column.old,
    b_fc: item.bond.fc, b_L: item.bond.L, b_P: item.bond.P, b_T: item.bond.T,
    p_D: item.pile.D, p_Lb: item.pile.Lb, p_Nb: item.pile.Nb, p_Ns: item.pile.Ns,
    p_FSb: item.pile.FSb, p_FSs: item.pile.FSs, p_P: item.pile.P,
  };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: Object.prototype.hasOwnProperty.call(values, id) ? String(values[id]) : '',
      checked: id === 'autolink' ? false : false,
      innerHTML: '', textContent: '', className: '', dataset: {},
      classList: { add() {}, remove() {} }, addEventListener() {}, click() {},
    });
    return elements.get(id);
  };
  const context = {
    console, Math,
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      querySelector: () => null,
    },
  };
  vm.createContext(context);
  const invocation = `
    var RESULTS = { deck:null, stringer:null, girder:null, column:null, bond:null, pile:null };
    var G = () => ({
      Fy:+document.getElementById('g_Fy').value, E:+document.getElementById('g_E').value,
      beta:+document.getElementById('g_beta').value, imp:+document.getElementById('g_imp').value,
      Wp:+document.getElementById('g_Wp').value, Wl:+document.getElementById('g_Wl').value,
      defl:+document.getElementById('g_defl').value
    });
    var getSec = name => H_SECTIONS.find(section => section.name === name);
    var fmt = (value, digits=3) => Number(value).toFixed(digits);
    var checkTag = () => '';
    var setStatus = () => {};
    var autolinkPuToColumn = () => {};
    ${productionCalculationSource}
    calcDeck(); calcStringer(); calcGirder(); calcColumn(); calcBond(); calcPile();
    globalThis.__deckingResults = RESULTS;
  `;
  vm.runInContext(`${productionSectionSource}\n${invocation}`, context, { filename: productionPagePath });
  return normalize(context.__deckingResults);
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-decking-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => [item.id, calculateCase(item)]));
}

module.exports = { validateInput, calculate };
