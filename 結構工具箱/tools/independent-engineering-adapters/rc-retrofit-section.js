const fs = require('fs');
const path = require('path');
const vm = require('vm');

const formalPagePath = path.resolve(__dirname, '../../../RC補強斷面性質.html');
const formalPageSource = fs.readFileSync(formalPagePath, 'utf8');
const requiredFormalWiring = [
  "const res = solveBeamMn(b, h, d, dp, fc, fy, Es, As, Asp, {",
  "const res0 = solveBeamMn(b, h, d, dp, fc, fy, Es, As, Asp, { mode:'rc' });",
  'const eps_fd_calc = epsilon_fd(fc, nLayer, Ef, tf_mm, efu) || 0.9*efu;',
  'eps_fd_max = anchor ? efu : eps_fd_calc;',
  'const Vs_Vf_used = Math.min(Vs_Vf_raw, Vs_hard_cap);',
  'f_cc = fc * (-1.254 + 2.254 * Math.sqrt(1 + 7.94*f_l/fc) - 2*f_l/fc);',
  'f_cc = fc + 4.1 * f_l;',
  'const pm_conf = pmCurvePoints(b, h, rebarLayers, f_cc, fy, Es);',
  'const demandAtPu_conf = findMnAtP(pm_conf, Nu_kgf);',
  'const Vs_Vj_used = Math.min(Vs_Vj_raw, Vs_cap);',
];
for (const wiring of requiredFormalWiring) {
  if (!formalPageSource.includes(wiring)) throw new Error('rc-retrofit-formal-page-wiring-drift');
}

const coreStart = formalPageSource.indexOf('function Vc_beam_ksc');
const coreEnd = formalPageSource.indexOf('// ============ 梁主計算', coreStart);
if (coreStart < 0 || coreEnd <= coreStart) throw new Error('rc-retrofit-production-core-boundary-drift');
const context = { Math };
vm.createContext(context);
vm.runInContext(`${formalPageSource.slice(coreStart, coreEnd)}\nthis.__production = { Vc_beam_ksc, Vc_col_ksc, Vs_stirrup, Vf_frp, beta1, Ec_ksc, epsilon_fd, activeBondLength_mm, kappaV_shear, pmCurvePoints, findMnAtP, solveBeamMn, uncrackedTransSection, crackedTransSection };`, context, { filename:formalPagePath });
const Production = context.__production;

function bool(value) {
  return value ? 1 : 0;
}

function validateInput(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== 5) return ['cases:five-retrofit-routes-required'];
  const issues = [];
  const ids = new Set();
  for (const item of input.cases) {
    const id = item?.id || 'case';
    if (!item?.id || ids.has(item.id)) issues.push('cases:unique-id-required');
    ids.add(item?.id);
    if (!['beam', 'column'].includes(item?.kind)) issues.push(`${id}.kind:beam-or-column-required`);
    for (const key of ['bMm', 'hMm', 'fc', 'fy', 'Av', 'stirrupSpacing', 'fyt']) {
      if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) <= 0) issues.push(`${id}.${key}:positive-finite-required`);
    }
    if (item.kind === 'beam') {
      if (!['rc', 'frp', 'plate'].includes(item.mode)) issues.push(`${id}.mode:known-beam-mode-required`);
      for (const key of ['dMm', 'dpMm', 'As', 'Asp', 'VuTf']) {
        if (!Number.isFinite(Number(item?.[key])) || Number(item[key]) < 0) issues.push(`${id}.${key}:nonnegative-finite-required`);
      }
    } else {
      if (!['none', 'jacket', 'frp'].includes(item.mode)) issues.push(`${id}.mode:known-column-mode-required`);
      if (!Array.isArray(item.rebarLayers) || item.rebarLayers.length < 2) issues.push(`${id}.rebarLayers:at-least-two-required`);
      for (const layer of item.rebarLayers || []) {
        if (!(Number(layer.A) > 0) || !Number.isFinite(Number(layer.y))) issues.push(`${id}.rebarLayers:positive-area-finite-y-required`);
      }
      for (const key of ['coverMm', 'NuTf', 'MuTfm']) {
        if (!Number.isFinite(Number(item?.[key]))) issues.push(`${id}.${key}:finite-required`);
      }
    }
  }
  return issues;
}

function evaluateBeam(item) {
  const b = item.bMm / 10;
  const h = item.hMm / 10;
  const d = item.dMm / 10;
  const dp = item.dpMm / 10;
  const Es = 2.04e6;
  const Ec = Production.Ec_ksc(item.fc);
  const ns = Es / Ec;
  let Af = 0;
  let Ef = 0;
  let ffu = 0;
  let efu = 0;
  let epsFdCalc = 0;
  let epsFdUsed = 0;
  let df = h;
  let AfSide = 0;
  let dfSide = h;
  let ApPlate = 0;
  let fyPlate = 0;
  let EsPlate = 0;
  let dsp = h;
  let ApSide = 0;
  let dspSide = h;
  let nf = 0;
  let nsPlate = 0;
  let activeBondLength = 0;
  let plateShear = 0;
  let frpShear = 0;
  let shearKv = 0;
  let shearKvRaw = 0;
  let shearEps = 0;

  if (item.mode === 'frp') {
    const p = item.frp;
    Ef = p.EfGPa * 10197;
    ffu = p.ffuMPa * 10.197 * p.CE;
    efu = p.efuPct / 100 * p.CE;
    const totalMm = p.tfMm * p.layers;
    Af = (p.widthMm / 10) * (totalMm / 10);
    epsFdCalc = Production.epsilon_fd(item.fc, p.layers, Ef, p.tfMm, efu) || 0.9 * efu;
    epsFdUsed = p.anchor || p.uwrap ? efu : epsFdCalc;
    activeBondLength = Production.activeBondLength_mm(p.layers, p.EfGPa * 1000, p.tfMm);
    if (p.uwrap) {
      const sideHeightMm = Math.max(0, item.hMm - p.slabMm);
      AfSide = 2 * (totalMm / 10) * (sideHeightMm / 10);
      dfSide = h - (sideHeightMm / 10) / 2;
      const kv = Production.kappaV_shear(item.fc * 0.0980665, p.layers, p.EfGPa * 1000, p.tfMm, sideHeightMm, efu, 'U');
      shearKv = kv.kv;
      shearKvRaw = kv.kv_raw;
      shearEps = Math.min(kv.kv * efu, 0.004);
      frpShear = 0.85 * 2 * (totalMm / 10) * Ef * shearEps * (sideHeightMm / 10);
    } else if (item.frpShear) {
      const s = item.frpShear;
      const kv = Production.kappaV_shear(item.fc * 0.0980665, p.layers, p.EfGPa * 1000, p.tfMm, s.dfvMm, efu, 'U');
      shearKv = kv.kv;
      shearKvRaw = kv.kv_raw;
      shearEps = Math.min(s.userEps, kv.kv * efu, 0.004);
      frpShear = 0.85 * Production.Vf_frp(p.layers, p.tfMm / 10, s.widthMm / 10, Ef, shearEps, s.angleDeg, s.dfvMm / 10, s.spacingMm / 10);
    }
    nf = Ef / Ec;
  } else if (item.mode === 'plate') {
    const p = item.plate;
    fyPlate = p.fy;
    EsPlate = p.Es;
    ApPlate = (p.widthMm / 10) * (p.thicknessMm / 10);
    dsp = h + p.thicknessMm / 20;
    nsPlate = EsPlate / Ec;
    if (p.uwrap) {
      const sideThicknessMm = p.sideThicknessMm || p.thicknessMm;
      const sideHeightMm = Math.max(0, item.hMm - p.slabMm);
      ApSide = 2 * (sideThicknessMm / 10) * (sideHeightMm / 10);
      dspSide = h - (sideHeightMm / 10) / 2;
      plateShear = 2 * (sideThicknessMm / 10) * fyPlate * Math.min(d, sideHeightMm / 10 * 0.9);
    }
  }

  const result = Production.solveBeamMn(b, h, d, dp, item.fc, item.fy, Es, item.As, item.Asp, {
    mode:item.mode, Af, Ef, ffu, efu, eps_fd:epsFdUsed, df, eps_bi:item.epsBi || 0,
    Af_side:AfSide, df_side:dfSide, Asp_plate:ApPlate, fy_sp:fyPlate, Es_sp:EsPlate,
    dsp, Asp_side:ApSide, dsp_side:dspSide,
  });
  const baseline = Production.solveBeamMn(b, h, d, dp, item.fc, item.fy, Es, item.As, item.Asp, { mode:'rc' });
  const uncracked = Production.uncrackedTransSection(b, h, item.As, item.Asp, d, dp, ns, Af, nf, df, ApPlate, dsp, nsPlate);
  const cracked = Production.crackedTransSection(b, h, item.As, item.Asp, d, dp, ns, Af, nf, df, ApPlate, dsp, nsPlate);
  const Vc = Production.Vc_beam_ksc(item.fc, b, d);
  const Vs = Production.Vs_stirrup(item.Av, item.fyt, d, item.stirrupSpacing);
  const shearCap = 2.1 * Math.sqrt(item.fc) * b * d;
  const shearReinfRaw = Vs + plateShear + frpShear;
  const shearReinfUsed = Math.min(shearReinfRaw, shearCap);
  const Vn = Vc + shearReinfUsed;
  const phiVn = 0.75 * Vn;
  return {
    beamRoute:1, columnRoute:0, frpRoute:bool(item.mode === 'frp'), plateRoute:bool(item.mode === 'plate'),
    uwrapRoute:bool(item.mode === 'frp' ? item.frp.uwrap : item.mode === 'plate' && item.plate.uwrap),
    Af, AfSide, ApPlate, ApSide, epsFdCalc, epsFdUsed, activeBondLength,
    neutralAxis:result.c, Mn:result.Mn, phi:result.phi, phiMn:result.phi * result.Mn,
    baselineMn:baseline.Mn, strengthGain:result.Mn / baseline.Mn,
    frpDelamination:bool(result.failMode === 'FRP 脫層'), frpRupture:bool(result.failMode === 'FRP 破斷'),
    uncrackedArea:uncracked.A, uncrackedI:uncracked.I,
    crackedOk:bool(cracked.ok), crackedNeutralAxis:cracked.kd || 0, crackedI:cracked.Icr || 0,
    Vc, Vs, plateShear, frpShear, shearKv, shearKvRaw, shearEps,
    shearCap, shearReinfRaw, shearReinfUsed, shearCapped:bool(shearReinfRaw > shearCap),
    Vn, phiVn, shearRatio:item.VuTf * 1000 / phiVn,
  };
}

function evaluateColumn(item) {
  const b = item.bMm / 10;
  const h = item.hMm / 10;
  const cover = item.coverMm / 10;
  const Es = 2.04e6;
  const Ast = item.rebarLayers.reduce((sum, layer) => sum + layer.A, 0);
  const Ag = b * h;
  const Ec = Production.Ec_ksc(item.fc);
  const ns = Es / Ec;
  let lateralPressure = 0;
  let confinedFc = item.fc;
  let jacketArea = 0;
  let jacketI = 0;
  let jacketShear = 0;
  let frpArea = 0;
  let frpI = 0;
  if (item.mode === 'jacket') {
    const p = item.jacket;
    const thickness = p.thicknessMm / 10;
    lateralPressure = p.ke * 2 * p.fy * thickness / h;
    confinedFc = item.fc * (-1.254 + 2.254 * Math.sqrt(1 + 7.94 * lateralPressure / item.fc) - 2 * lateralPressure / item.fc);
    if (!Number.isFinite(confinedFc) || confinedFc < item.fc) confinedFc = item.fc;
    jacketArea = 2 * (b + h + 2 * thickness) * thickness;
    jacketI = 2 * b * thickness * (h / 2 + thickness / 2) ** 2 + 2 * h * thickness ** 3 / 12;
    jacketShear = 2 * thickness * p.fy * (h - cover);
  } else if (item.mode === 'frp') {
    const p = item.frp;
    const Ef = p.EfGPa * 10197;
    const totalThickness = p.tfMm / 10 * p.layers;
    lateralPressure = p.ka * 2 * Ef * p.effectiveStrain * totalThickness / h;
    confinedFc = item.fc + 4.1 * lateralPressure;
    frpArea = 2 * (b + h) * totalThickness;
    frpI = frpArea * (h / 2) ** 2 * 0.5;
    jacketShear = 0.95 * 2 * totalThickness * Ef * 0.004 * (h - cover);
  }
  const PoBase = 0.85 * item.fc * (Ag - Ast) + item.fy * Ast;
  const PoConf = 0.85 * confinedFc * (Ag - Ast) + item.fy * Ast;
  const topBottomFraction = item.layout === 'perim' ? 0.3 : 0.5;
  const flexBase = Production.solveBeamMn(b, h, h - cover, cover, item.fc, item.fy, Es, Ast * topBottomFraction, Ast * topBottomFraction, { mode:'rc' });
  const flexConf = Production.solveBeamMn(b, h, h - cover, cover, confinedFc, item.fy, Es, Ast * topBottomFraction, Ast * topBottomFraction, { mode:'rc' });
  const baseArea = Ag + (ns - 1) * Ast;
  const baseI = b * h ** 3 / 12 + (ns - 1) * (2 * Ast * topBottomFraction * (h / 2 - cover) ** 2);
  let transformedArea = baseArea;
  let transformedI = baseI;
  if (item.mode === 'jacket') {
    const nj = item.jacket.Es / Ec;
    transformedArea += (nj - 1) * jacketArea;
    transformedI += (nj - 1) * jacketI;
  } else if (item.mode === 'frp') {
    const nf = item.frp.EfGPa * 10197 / Ec;
    transformedArea += (nf - 1) * frpArea;
    transformedI += (nf - 1) * frpI;
  }
  const Nu = item.NuTf * 1000;
  const Mu = item.MuTfm * 1e5;
  const Vc = Production.Vc_col_ksc(item.fc, b, h, h - cover, Nu);
  const VsRaw = Production.Vs_stirrup(item.Av, item.fyt, h - cover, item.stirrupSpacing);
  const shearCap = 2.1 * Math.sqrt(item.fc) * b * (h - cover);
  const Vs = Math.min(VsRaw, shearCap);
  const shearReinfRaw = Vs + jacketShear;
  const shearReinfUsed = Math.min(shearReinfRaw, shearCap);
  const Vn = Vc + shearReinfUsed;
  const phiVn = 0.75 * Vn;
  const pmBase = Production.pmCurvePoints(b, h, item.rebarLayers, item.fc, item.fy, Es);
  const pmConf = Production.pmCurvePoints(b, h, item.rebarLayers, confinedFc, item.fy, Es);
  const demandBase = Production.findMnAtP(pmBase, Nu);
  const demandConf = Production.findMnAtP(pmConf, Nu);
  return {
    beamRoute:0, columnRoute:1, jacketRoute:bool(item.mode === 'jacket'), frpRoute:bool(item.mode === 'frp'),
    Ast, lateralPressure, confinedFc, PoBase, PoConf, PnMaxBase:0.8 * PoBase, PnMaxConf:0.8 * PoConf,
    phiPnMaxConf:0.65 * 0.8 * PoConf,
    flexMnBase:flexBase.Mn, flexMnConf:flexConf.Mn,
    baseArea, transformedArea, baseI, transformedI,
    Vc, VsRaw, Vs, jacketShear, shearCap, shearReinfRaw, shearReinfUsed,
    shearCapped:bool(shearReinfRaw > shearCap), Vn, phiVn,
    pmBaseEvaluated:bool(demandBase), pmConfEvaluated:bool(demandConf),
    pmPhiMnBase:demandBase ? demandBase.phiMn : 0,
    pmPhiMnConf:demandConf ? demandConf.phiMn : 0,
    pmRatioConf:demandConf && demandConf.phiMn > 0 ? Mu / demandConf.phiMn : 0,
    pmOk:bool(demandConf && demandConf.phiMn > 0 && Mu <= demandConf.phiMn),
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-rc-retrofit-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => [item.id, item.kind === 'beam' ? evaluateBeam(item) : evaluateColumn(item)]));
}

module.exports = { validateInput, calculate };
